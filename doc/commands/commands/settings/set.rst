###################
Settings (set)
###################

Name
==================

lowsync-settings-set - Set settings of the device

Synopsis
==================

.. code-block:: bash

    lowsync settings set [<category>.<setting>=<value>..]

Description
==================

Set one or more settings.

See the :doc:`/commands/commands/settings/set` command for available settings.

Options
==================

.. code-block:: bash

    <category>.<setting>=<value>..

If the value is a string and contains spaces, it must be enclosed in double quotes (:code:`"`). Multiple key/value pairs may be given. Separate multiple key/value pairs with spaces.

Examples
==================

.. code-block:: bash

    lowsync settings set example.setting="an example"

Sets the setting *example.setting* to *an example*.