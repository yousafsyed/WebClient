angular.module("proton.controllers.Contacts", [
    "proton.modals"
])

.controller("ContactsController", function(
    $rootScope,
    $scope,
    $state,
    $log,
    $translate,
    $stateParams,
    $filter,
    contacts,
    Contact,
    confirmModal,
    contactModal,
    dropzoneModal,
    Message,
    networkActivityTracker,
    notify
) {
    $scope.params = {
        searchContactInput: ''
    };

    $rootScope.pageName = "Contacts";
    $rootScope.user.Contacts = contacts.Contacts;
    $scope.editing = false;
    $scope.currentPage = 1;
    $scope.numPerPage = 40;
    $scope.sortBy = 'Name';

    $scope.contactsFiltered = function(searching) {
        var contacts = $rootScope.user.Contacts;

        function pagination(contacts) {
            var begin, end;

            begin = ($scope.currentPage - 1) * $scope.numPerPage;
            end = begin + $scope.numPerPage;

            return contacts.slice(begin, end);
        }

        function orderBy(contacts) {
            var result = $filter('orderBy')(contacts, $scope.sortBy);

            $scope.totalItems = result.length;

            return result;
        }

        function search(contacts) {
            return $filter('filter')(contacts, $scope.params.searchContactInput);
        }

        if(searching === true) {
            $scope.currentPage = 1;
        }

        return pagination(orderBy(search($rootScope.user.Contacts)));
    };

    $scope.contacts = $scope.contactsFiltered();

    $scope.refreshContacts = function(searching) {
        $scope.contacts = $scope.contactsFiltered(searching);
    };

    $scope.setSortBy = function(sort) {
        $scope.sortBy = sort;
        $scope.refreshContacts();
    };

    function openContactModal(title, name, email, save) {
        contactModal.activate({
            params: {
                title: title,
                name: name,
                email: email,
                save: save,
                cancel: function() {
                    contactModal.deactivate();
                }
            }
        });
    }

    $scope.deleteContacts = function(contact) {
        var contactsSelected = contact ? [contact] : $scope.contactsSelected();
        var message, title;

        if (contactsSelected.length === 1) {
            title = $translate.instant('DELETE_CONTACT');
            message = 'Are you sure you want to delete this contact?';
        } else {
            title = $translate.instant('DELETE_CONTACTS');
            message = 'Are you sure you want to delete contacts?';
        }

        confirmModal.activate({
            params: {
                title: title,
                message: message,
                confirm: function() {
                    deletedIDs = [];
                    deletedContacts = [];
                    _.forEach(contactsSelected, function(contact) {
                        deletedIDs.push(contact.ID.toString());
                        deletedContacts.push(contact);
                    });

                    $rootScope.user.Contacts = _.difference($rootScope.user.Contacts, deletedContacts);

                    networkActivityTracker.track(
                        Contact.delete({
                            "IDs" : deletedIDs
                        }).$promise.then(function(response) {
                            _.forEach(response, function(d, i) {
                                if (JSON.parse(d.Response).Code !== 1000) {
                                    notify(deletedContacts[i].Email +' Not Deleted');
                                    $rootScope.user.Contacts.push(deletedContacts[i]);
                                }
                            });
                            notify($translate.instant('CONTACTS_DELETED'));
                            Contact.index.updateWith($scope.contacts);
                        }, function(response) {
                            $log.error(response);
                        })
                    );
                    confirmModal.deactivate();
                },
                cancel: function() {
                    confirmModal.deactivate();
                }
            }
        });
    };

    $scope.addContact = function() {
        openContactModal('Add New Contact', '', '', function(name, email) {
            var match = _.findWhere($rootScope.user.Contacts, {Email: email});

            if (match) {
                notify("Contact exists for this email address");
                contactModal.deactivate();
            }
            else {
                var newContact = {
                    Name: name,
                    Email: email
                };
                var contactList = [];
                contactList.push(newContact);
                networkActivityTracker.track(
                    Contact.save({
                        Contacts : contactList
                    }).$promise.then(function(response) {
                        if (response[0].Response.Contact) {
                            $rootScope.user.Contacts.push(response[0].Response.Contact);
                            notify('Saved');
                        }
                        else {
                            notify(response[0].Response.Error);
                        }
                        Contact.index.updateWith($rootScope.user.Contacts);
                        contactModal.deactivate();
                    }, function(response) {
                        $log.error(response);
                    })
                );
            }
        });
    };

    $scope.editContact = function(contact) {
        openContactModal('Edit Contact', contact.Name, contact.Email, function(name, email) {
            var origName = contact.Name;
            var origEmail = contact.Email;

            contact.Name = name;
            contact.Email = email;

            var match = _.findWhere($rootScope.user.Contacts, {Email: email});

            if (match && email !== origEmail) {
                notify("Contact exists for this email address");
                contact.Name = origName;
                contact.Email = origEmail;
                contactModal.deactivate();
            }
            else {
                networkActivityTracker.track(
                    Contact.edit({
                        "Name": name,
                        "Email": email,
                        "id": contact.ID
                    }).$promise.then(function(response) {
                            contactModal.deactivate();
                            notify($translate.instant('CONTACT_EDITED'));
                            Contact.index.updateWith($rootScope.user.Contacts);
                        }, function(response) {
                            notify({
                                message: response.error
                            });
                            $log.error(response);
                        })
                );
            }

        });
    };

    $scope.allSelected = function() {
        var status = true;

        if ($rootScope.user.Contacts.length > 0) {
            _.forEach($rootScope.user.Contacts, function(contact) {
                if (!!!contact.selected) {
                    status = false;
                }
            });
        } else {
            status = false;
        }

        return status;
    };

    $scope.selectAllContacts = function() {
        var status = !!!$scope.allSelected();

        _.forEach($rootScope.user.Contacts, function(contact) {
            contact.selected = status;
        }, this);
    };

    $scope.onSelectContact = function(event, contact) {
        var contactsSelected = $scope.contactsSelected();

        if (event.shiftKey) {
            var start = $rootScope.user.Contacts.indexOf(_.first(contactsSelected));
            var end = $rootScope.user.Contacts.indexOf(_.last(contactsSelected));

            for (var i = start; i < end; i++) {
                $rootScope.user.Contacts[i].selected = true;
            }
        }
    };

    $scope.contactsSelected = function() {
        return _.filter($rootScope.user.Contacts, function(contact) {
            return contact.selected === true;
        });
    };

    $scope.sendMessageTo = function(contact) {
        var message = new Message();

        _.defaults(message, {
            ToList: [{Address: contact.Email, Name: contact.Name}],
            CCList: [],
            BCCList: [],
            Subject: '',
            PasswordHint: '',
            Attachments: []
        });

        $rootScope.$broadcast('loadMessage', message);
    };

    $scope.uploadContacts = function() {
        dropzoneModal.activate({
            params: {
                title: 'Upload Contacts',
                message: 'Allowed format(s): <code>.vcf, .csv</code><a class="pull-right" href="/blog/exporting-contacts" target="_blank">Need help?</a>',
                import: function(files) {
                    var contactArray = [];
                    var extension = files[0].name.slice(-4);

                    var reader = new FileReader();
                    reader.onload = function(e) {
                        var text = unescape(encodeURIComponent(reader.result));

                        if (extension === '.vcf') {

                              var vcardData = vCard.parse(text);

                              _.forEach(vcardData, function(d, i) {
                                  if (d.fn && d.email) {
                                      contactArray.push({'ContactName' : d.fn.value, 'ContactEmail' : d.email.value});
                                  }
                                  else if(d.email) {
                                      contactArray.push({'ContactName' : d.email.value, 'ContactEmail' : d.email.value});
                                  }
                              });

                              importContacts(contactArray);
                        }
                        else if(extension === '.csv') {
                            Papa.parse(text, {
                            	complete: function(results) {
                                    var csv = results.data;
                                    var nameKeys = ['Name', 'First Name'];
                                    var emailKeys = ['E-mail 1 - Value', 'E-mail Address', 'Email Address', 'E-mail', 'Email'];

                                    nameKey = _.find(nameKeys, function(d, i) {
                                        return csv[0].indexOf(d) > -1;
                                    });

                                    emailKey = _.find(emailKeys, function(d, i) {
                                        return csv[0].indexOf(d) > -1;
                                    });

                                    nameIndex = csv[0].indexOf(nameKey);
                                    emailIndex = csv[0].indexOf(emailKey);
                                    lastNameIndex = (nameKey === 'First Name' ? csv[0].indexOf('Last Name') : undefined);
                                    _.forEach(csv, function(d, i) {
                                      if (i > 0 && typeof(d[emailIndex]) !== 'undefined' && d[emailIndex] !== '') {
                                        if (d[nameIndex] !== '') {
                                          contactArray.push({'Name' : d[nameIndex], 'Email' : d[emailIndex]});
                                        }
                                        else {
                                          contactArray.push({'Name' : d[emailIndex], 'Email' : d[emailIndex]});
                                        }
                                      }
                                    });

                                    importContacts(contactArray);
                            	}
                            });
                        }
                        else {
                            notify('Invalid file type');
                        }
                    };

                    reader.readAsBinaryString(files[0]);

                    importContacts = function(contactArray) {
                        networkActivityTracker.track(
                            Contact.save({
                                "Contacts": contactArray
                            }).$promise.then(function(response) {
                                added = 0;
                                duplicates = 0;
                                _.forEach(response, function(d) {
                                    if (d.Response.Contact) {
                                        $rootScope.user.Contacts.push(d.Response.Contact);
                                        added++;
                                    }
                                    else {
                                        duplicates++;
                                    }
                                });
                                added = added === 1 ? added + ' contact' : added + ' contacts';
                                duplicates = duplicates === 1 ? duplicates + ' contact was' : duplicates + ' contacts were';
                                notify(added + ' imported, ' + duplicates + ' already in your contact list');
                                Contact.index.updateWith($rootScope.user.Contacts);
                            }, function(response) {
                                $log.error(response);
                            })
                        );
                    };

                    dropzoneModal.deactivate();
                },
                cancel: function() {
                    dropzoneModal.deactivate();
                }
            }
        });
    };

    $scope.downloadContacts = function() {
        var contactsArray = [['Name', 'Email']];
        var csvRows = [];

        _.forEach($rootScope.user.Contacts, function(contact) {
          contactsArray.push([contact.Name, contact.Email]);
        });

        for(var i=0, l=contactsArray.length; i<l; ++i){
            csvRows.push(contactsArray[i].join(','));
        }

        var csvString = csvRows.join("%0A");
        var a         = document.createElement('a');
        a.href        = 'data:attachment/csv,' + csvString;
        a.target      = '_blank';
        a.download    = 'contacts.csv';

        document.body.appendChild(a);
        a.click();
    };
});
